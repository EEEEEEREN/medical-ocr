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

    // 图标和模式初始化逻辑
    const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
    const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
    const themeToggleBtn = document.getElementById('theme-toggle');

    // 缓存系统 (使用严格的ID绑定图片，防止混淆)
    let currentFileId = '';
    const translationCache = {}; // 格式: { "uniqueId_en": "translated_text", "uniqueId_zh": "原文" }

    // 初始化：设置明暗图标状态
    function initThemeIcon() {
        if (document.documentElement.classList.contains('dark')) {
            themeToggleLightIcon.classList.remove('hidden'); // 暗黑模式下显示太阳图标
        } else {
            themeToggleDarkIcon.classList.remove('hidden'); // 白天模式下显示月亮图标
        }
    }
    initThemeIcon();

    // 1. 主题切换逻辑
    themeToggleBtn.addEventListener('click', () => {
        // 切换图标显示
        themeToggleDarkIcon.classList.toggle('hidden');
        themeToggleLightIcon.classList.toggle('hidden');
        
        // 切换 HTML class 并保存用户偏好 (如需要)
        document.documentElement.classList.toggle('dark');
    });

    // 2. 处理图片文件上传 (核心修正部分)
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        // 【关键】重置所有缓存和UI状态
        translationCache = {}; 
        currentFileId = file.name + "_" + file.size + "_" + file.lastModified; // 生成相对唯一的ID
        langText.innerText = "切换至英文"; 
        resultContent.innerHTML = '<div class="text-blue-500 italic text-center py-20 flex flex-col items-center gap-3"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>正在重新识图，请稍候...</div>';
        
        // 显示预览
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // 显示状态栏
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在向腾讯云发起识图请求...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                // 将原文存入缓存 (使用独特的ID前缀)
                translationCache[currentFileId + "_zh"] = data.text;
                updateDisplay(data.text);
                statusText.innerText = "文字提取已完成，点击上方按钮切换中/英。";
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4 bg-red-50 dark:bg-red-950 rounded-lg">OCR 识图失败: ${data.error}</div>`;
                statusText.innerText = "识图失败。";
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4 bg-red-50 dark:bg-red-950 rounded-lg">服务器连接异常，请检查Vercel Logs。</div>';
            statusText.innerText = "网络异常。";
        }
    }

    // 3. 翻译切换逻辑 (即时抓取屏幕文字，解决缓存问题)
    langToggleBtn.addEventListener('click', async () => {
        // 核心：不要用全局变量，要直接从网页元素里抓取当前的文字
        const textToProcess = document.getElementById('result-content').innerText.trim(); 
        
        if (!textToProcess || textToProcess === "等待识别结果...") {
            alert("请先上传病例图片并等待 OCR 完成。");
            return;
        }

        const currentLangLabel = langText.innerText;

        if (currentLangLabel === "切换至英文") {
            // 需要翻译成英文
            const cacheKey = currentFileId + "_en";
            
            if (translationCache[cacheKey]) {
                // 如果有缓存直接显示
                updateDisplay(translationCache[cacheKey]);
                langText.innerText = "切换至中文";
            } else {
                // 如果没有缓存请求腾讯云
                statusText.innerText = "正在请求腾讯云机器翻译...";
                try {
                    const response = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        // 【修正点】明确发送 text 和目标语言 target: 'en'
                        body: JSON.stringify({ text: textToProcess, target: 'en' })
                    });
                    const data = await response.json();

                    if (data.success) {
                        translationCache[cacheKey] = data.text; // 存入缓存
                        updateDisplay(data.text);
                        langText.innerText = "切换至中文";
                        statusText.innerText = "翻译已完成。";
                    } else {
                        alert(data.error);
                        statusText.innerText = "翻译报错，请重试。";
                    }
                } catch (err) {
                    console.error(err);
                    alert("翻译接口连接失败。");
                }
            }
        } else {
            // 此时显示的是英文，切回中文 (中文总是存在缓存里的)
            const originCacheKey = currentFileId + "_zh";
            updateDisplay(translationCache[originCacheKey] || textToProcess); // 如果没缓存则显示当前文字防止出错
            langText.innerText = "切换至英文";
        }
    });

    // 辅助：更新内容展示区域
    function updateDisplay(text) {
        // 使用 font-sans 确保专业术语对齐，whitespace-pre-wrap 保留换行和空格
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 leading-relaxed">${text}</pre>`;
    }

    // 4. 复制功能
    copyBtn.addEventListener('click', () => {
        const textToCopy = document.getElementById('result-content').innerText;
        if (!textToCopy || textToCopy === "等待识别结果...") return;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            copyBtn.classList.remove('bg-emerald-500');
            copyBtn.classList.add('bg-gray-400');
            setTimeout(() => {
                copyBtn.innerText = originalText;
                copyBtn.classList.remove('bg-gray-400');
                copyBtn.classList.add('bg-emerald-500');
            }, 1500);
        });
    });

    // 事件绑定
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-blue-500', 'bg-blue-100/50'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('border-blue-500', 'bg-blue-100/50'); });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('border-blue-500', 'bg-blue-100/50'); handleFile(e.dataTransfer.files[0]); });
});
