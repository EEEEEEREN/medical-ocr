document.addEventListener('DOMContentLoaded', () => {
    // 获取 HTML 中的元素（确保 ID 与 HTML 匹配）
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const dropzone = document.getElementById('dropzone');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const resultContent = document.getElementById('result-content');
    const translateBtn = document.getElementById('output-lang-toggle');
    const langText = document.getElementById('lang-text');
    const copyBtn = document.getElementById('copy-btn');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');

    let currentOcrText = ''; // 存储中文原件
    let currentTransText = ''; // 存储翻译后的英文
    let isEnglish = false; // 当前显示状态

    // 辅助函数：显示状态提示
    const showStatus = (msg, isError = false) => {
        statusBar.classList.remove('hidden');
        statusText.innerText = msg;
        statusText.className = isError ? 'text-red-500' : 'text-blue-600';
    };

    // 1. 点击“选择文件”按钮触发隐藏的 input
    selectFileBtn.addEventListener('click', () => fileInput.click());

    // 2. 处理文件上传识别
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 重置状态
        isEnglish = false;
        langText.innerText = "切换至英文";
        resultContent.innerHTML = '<p class="text-blue-500 italic text-center py-20">正在识图提取文字...</p>';
        showStatus("正在处理图片...");

        // 显示预览图
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // 发送请求给后端 OCR
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                currentOcrText = data.text;
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">${currentOcrText}</pre>`;
                showStatus("识别成功");
            } else {
                showStatus("识别失败: " + data.error, true);
                resultContent.innerHTML = `<p class="text-red-400">错误：${data.error}</p>`;
            }
        } catch (err) {
            showStatus("服务器连接异常", true);
        }
    });

    // 3. 处理翻译切换按钮
    translateBtn.addEventListener('click', async () => {
        if (!currentOcrText) {
            alert("请先上传图片并识别文字");
            return;
        }

        if (!isEnglish) {
            // 需要翻译成英文
            if (currentTransText) {
                // 如果已经翻译过，直接显示缓存
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-blue-700 dark:text-blue-300">${currentTransText}</pre>`;
                langText.innerText = "切换至中文";
                isEnglish = true;
            } else {
                // 发起翻译请求
                showStatus("正在请求百度翻译...");
                langText.innerText = "翻译中...";
                
                try {
                    const response = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: currentOcrText, target: 'en' })
                    });
                    const data = await response.json();

                    if (data.success) {
                        currentTransText = data.text;
                        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-blue-700 dark:text-blue-300">${currentTransText}</pre>`;
                        langText.innerText = "切换至中文";
                        isEnglish = true;
                        showStatus("翻译完成");
                    } else {
                        showStatus("翻译失败: " + data.error, true);
                        langText.innerText = "切换至英文";
                    }
                } catch (err) {
                    showStatus("翻译请求崩溃", true);
                }
            }
        } else {
            // 切换回中文
            resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">${currentOcrText}</pre>`;
            langText.innerText = "切换至英文";
            isEnglish = false;
        }
    });

    // 4. 复制功能
    copyBtn.addEventListener('click', () => {
        const text = isEnglish ? currentTransText : currentOcrText;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "已复制！";
            copyBtn.classList.replace('bg-emerald-500', 'bg-gray-500');
            setTimeout(() => {
                copyBtn.innerText = originalText;
                copyBtn.classList.replace('bg-gray-500', 'bg-emerald-500');
            }, 2000);
        });
    });

    // 5. 简单的主题切换逻辑
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
    });
});
