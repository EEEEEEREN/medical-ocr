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

    // 主题切换
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
        currentFileUrl = '';

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        resultContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full gap-4 py-10">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600/20 border-t-blue-600"></div>
                <p class="text-blue-600 dark:text-blue-400 animate-pulse">AI 正在深度解析中...</p>
            </div>`;

        statusBar.classList.remove('hidden');
        statusText.innerText = "正在识别...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                const detected = data.language || ((data.text.match(/[a-zA-Z]/g) || []).length / (data.text.length || 1) > 0.4 ? 'en' : 'zh');
                
                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                currentFileUrl = data.file_url || '';

                updateDisplay(data.text);

                let saveMsg = '✅ 已保存到数据库';
                if (currentFileUrl) saveMsg += ` <a href="${currentFileUrl}" target="_blank" class="underline">查看原图</a>`;
                statusText.innerHTML = saveMsg;

                // 自动刷新历史
                loadHistory();
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4">识别失败: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4">网络连接失败</div>';
        }
    }

    function updateDisplay(text) {
        resultContent.classList.add('items-start', 'justify-start');
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">${text}</pre>`;
    }

    // ==================== 历史记录 ====================
    async function loadHistory() {
        const container = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();

            if (!data.success || !data.records.length) {
                container.innerHTML = `<div class="text-center py-8 text-gray-400 text-xs">暂无记录</div>`;
                return;
            }

            let html = '';
            data.records.forEach(record => {
                const date = new Date(record.created_at).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
                
                html += `
                    <div class="history-item bg-gray-50 dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-700 group">
                        <div class="flex justify-between items-start mb-1">
                            <div class="text-[10px] text-gray-500">${date} · ${record.language}</div>
                            <button onclick="deleteRecord(${record.id})" 
                                    class="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all text-xs">
                                删除
                            </button>
                        </div>
                        <div class="text-xs font-medium mb-1 line-clamp-1">${record.filename}</div>
                        ${record.file_url ? `<a href="${record.file_url}" target="_blank" class="text-blue-500 text-[10px] hover:underline">查看原图</a>` : ''}
                        <div class="text-[10px] text-gray-500 mt-2 line-clamp-3">${record.ocr_text?.substring(0, 80) || ''}...</div>
                    </div>`;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<div class="text-red-400 text-xs py-4">加载失败</div>`;
        }
    }

    // 删除记录（全局函数，供 onclick 调用）
    window.deleteRecord = async function(id) {
        if (!confirm('确定删除这条记录吗？')) return;
        
        try {
            await fetch(`/delete/${id}`, { method: 'DELETE' });
            loadHistory();   // 删除后自动刷新
        } catch (err) {
            alert('删除失败');
        }
    };

    // ==================== 事件绑定 ====================
    dropzone.addEventListener('click', () => fileInput.click());
    selectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-blue-500'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-blue-500'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-blue-500');
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

    langToggleBtn.addEventListener('click', async () => { /* 保持原有翻译逻辑 */ });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText || '').then(() => {
            const orig = copyBtn.innerText;
            copyBtn.innerText = "已复制";
            setTimeout(() => copyBtn.innerText = orig, 1500);
        });
    });

    // 页面加载时加载历史
    loadHistory();
});
