document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const resultContent = document.getElementById('result-content');
    const translateBtn = document.getElementById('output-lang-toggle');
    const langText = document.getElementById('lang-text');
    const statusText = document.getElementById('status-text');
    const statusBar = document.getElementById('status-bar');

    let ocrResultCache = ''; // 存储原始中文
    let transResultCache = ''; // 存储翻译英文
    let currentMode = 'zh'; // 当前显示的是 zh 还是 en

    // 1. 上传新图片时彻底清空上一次的残留
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 【关键】重置所有缓存和状态
        ocrResultCache = '';
        transResultCache = '';
        currentMode = 'zh';
        langText.innerText = "切换至英文";
        resultContent.innerHTML = '<p class="text-blue-500 italic text-center py-20">正在重新识图，请稍候...</p>';
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在提取文字...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) {
                ocrResultCache = data.text; // 存入新结果
                updateDisplay(ocrResultCache);
                statusText.innerText = "识图已完成";
            } else {
                statusText.innerText = "识图失败";
                resultContent.innerHTML = `<p class="text-red-500">${data.error}</p>`;
            }
        } catch (err) {
            statusText.innerText = "服务器连接异常";
        }
    });

    // 2. 翻译切换逻辑
    translateBtn.addEventListener('click', async () => {
        if (!ocrResultCache) return alert("请先上传病例图片");

        if (currentMode === 'zh') {
            // 需要显示英文
            if (transResultCache) {
                updateDisplay(transResultCache);
                currentMode = 'en';
                langText.innerText = "切换至中文";
            } else {
                statusText.innerText = "正在请求腾讯云翻译...";
                try {
                    const response = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: ocrResultCache, target: 'en' })
                    });
                    const data = await response.json();
                    if (data.success) {
                        transResultCache = data.text;
                        updateDisplay(transResultCache);
                        langText.innerText = "切换至中文";
                        currentMode = 'en';
                        statusText.innerText = "翻译已完成";
                    } else {
                        alert(data.error);
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        } else {
            // 切回中文
            updateDisplay(ocrResultCache);
            langText.innerText = "切换至英文";
            currentMode = 'zh';
        }
    });

    function updateDisplay(text) {
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200">${text}</pre>`;
    }

    selectFileBtn.addEventListener('click', () => fileInput.click());
    document.getElementById('theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('dark'));
});
