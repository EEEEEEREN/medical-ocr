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

    let translationCache = { 'zh': '', 'en': '' };
    let currentDisplayLang = '';
    let currentFileUrl = '';

    // ==================== 主题切换 ====================
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

    // ==================== 处理文件上传 ====================
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        translationCache = { 'zh': '', 'en': '' };
        currentDisplayLang = '';
        currentFileUrl = '';

        // 预览图片
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // 加载动画
        resultContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full gap-4 py-10">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600/20 border-t-blue-600"></div>
                <p class="text-blue-600 dark:text-blue-400 animate-pulse">AI 正在深度解析中...</p>
            </div>`;

        statusBar.classList.remove('hidden');
        statusText.innerHTML = "正在调用 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                const detected = data.language || 
                    ((data.text.match(/[a-zA-Z]/g) || []).length / (data.text.length || 1) > 0.4 ? 'en' : 'zh');

                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                currentFileUrl = data.file_url || '';

                // 显示识别结果
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm leading-relaxed">${data.text}</pre>`;

                // 显示保存状态
                let saveMsg = '✅ 已成功识别并保存到数据库';
                if (currentFileUrl) {
                    saveMsg += ` <a href="${currentFileUrl}" target="_blank" class="underline text-blue-600 dark:text-blue-400">查看原图</a>`;
                }
                statusText.innerHTML = saveMsg;

                // 自动刷新历史记录
                loadHistory();

            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4 italic">识别出错: ${data.error}</div>`;
                statusText.innerHTML = "识别失败";
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4 italic">网络连接失败</div>';
            statusText.innerHTML = "网络错误";
        }
    }

    // ==================== 仅前端隐藏记录（数据库不删除） ====================
    function getDeletedIds() {
        const deleted = localStorage.getItem('deletedRecords');
        return deleted ? JSON.parse(deleted) : [];
    }

    function addToDeleted(id) {
        const deleted = getDeletedIds();
        if (!deleted.includes(id)) {
            deleted.push(id);
            localStorage.setItem('deletedRecords', JSON.stringify(deleted));
        }
    }

    async function loadHistory() {
        const container = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();

            if (!data.records || data.records.length === 0) {
                container.innerHTML = `<p class="text-gray-400 text-center py-8 text-xs">暂无记录</p>`;
                return;
            }

            const deletedIds = getDeletedIds();
            const visibleRecords = data.records.filter(record => !deletedIds.includes(record.id));

            if (visibleRecords.length === 0) {
                container.innerHTML = `<p class="text-gray-400 text-center py-8 text-xs">暂无记录（已全部隐藏）</p>`;
                return;
            }

            let html = '';
            visibleRecords.forEach(record => {
                const date = new Date(record.created_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                html += `
                    <div class="history-item bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 group">
                        <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>${date}</span>
                            <span class="uppercase">${record.language}</span>
                        </div>
                        <div class="text-xs font-medium mb-1 line-clamp-1">${record.filename}</div>
                        ${record.file_url ? 
                            `<a href="${record.file_url}" target="_blank" class="text-blue-600 text-[10px] hover:underline block mb-1">查看原图</a>` : ''}
                        <div class="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-3">
                            ${record.ocr_text ? record.ocr_text.substring(0, 85) + '...' : '无识别文字'}
                        </div>
                        <button onclick="hideRecord(${record.id})" 
                                class="mt-2 text-red-500 hover:text-red-600 text-[10px] opacity-70 hover:opacity-100">
                            隐藏记录
                        </button>
                    </div>`;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p class="text-red-400 text-xs py-4">加载历史失败</p>`;
        }
    }

    // 隐藏记录（仅前端）
    window.hideRecord = function(id) {
        if (confirm('确定要在网页上隐藏这条记录吗？\n数据库中的记录仍然会保留。')) {
            addToDeleted(id);
            loadHistory();
        }
    };

    // ==================== 事件绑定 ====================
    dropzone.addEventListener('click', () => fileInput.click());
    selectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
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

    // 粘贴上传
    document.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                handleFile(item.getAsFile());
            }
        }
    });

    // 语言切换
    langToggleBtn.addEventListener('click', async () => {
        if (!currentDisplayLang) return;
        const targetLang = (currentDisplayLang === 'zh') ? 'en' : 'zh';

        if (translationCache[targetLang]) {
            resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm leading-relaxed">${translationCache[targetLang]}</pre>`;
            currentDisplayLang = targetLang;
            return;
        }

        statusText.innerHTML = "翻译中...";
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: translationCache[currentDisplayLang], target: targetLang })
            });
            const data = await response.json();
            if (data.success) {
                translationCache[targetLang] = data.text;
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm leading-relaxed">${data.text}</pre>`;
                currentDisplayLang = targetLang;
            }
        } catch (err) {
            statusText.innerHTML = "翻译失败";
        }
    });

    // 复制按钮
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText || '').then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = originalText, 1500);
        });
    });

    // 页面加载时自动加载历史记录
    loadHistory();
});
