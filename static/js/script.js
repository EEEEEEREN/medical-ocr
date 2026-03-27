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

    // 处理文件上传
    async function handleFile(file) {
        if (!file) return;

        translationCache = { 'zh': '', 'en': '' };
        currentDisplayLang = '';
        currentFileUrl = '';

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        resultContent.innerHTML = `<div class="flex items-center justify-center h-full"><div class="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>`;
        statusBar.classList.remove('hidden');
        statusText.innerHTML = "正在识别...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                const detected = data.language || ((data.text.match(/[a-zA-Z]/g) || []).length / (data.text.length || 1) > 0.4 ? 'en' : 'zh');
                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                currentFileUrl = data.file_url || '';

                resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-sm leading-relaxed">${data.text}</pre>`;

                let msg = '✅ 已保存到数据库';
                if (currentFileUrl) msg += ` <a href="${currentFileUrl}" target="_blank" class="underline text-blue-600">查看原图</a>`;
                statusText.innerHTML = msg;

                loadHistory();   // 自动刷新历史
            } else {
                statusText.innerHTML = `错误: ${data.error}`;
            }
        } catch (err) {
            statusText.innerHTML = "网络连接失败";
        }
    }

    // 历史记录
    async function loadHistory() {
        const container = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();

            if (!data.records || data.records.length === 0) {
                container.innerHTML = `<p class="text-gray-400 text-center py-8 text-xs">暂无记录</p>`;
                return;
            }

            let html = '';
            data.records.forEach(r => {
                const date = new Date(r.created_at).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
                html += `
                    <div class="history-item bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <div class="flex justify-between text-[10px] text-gray-500">
                            <span>${date}</span>
                            <span class="uppercase">${r.language}</span>
                        </div>
                        <div class="text-xs font-medium mt-1 mb-1">${r.filename}</div>
                        ${r.file_url ? `<a href="${r.file_url}" target="_blank" class="text-blue-600 text-[10px]">查看原图</a>` : ''}
                        <button onclick="deleteRecord(${r.id})" class="text-red-500 text-[10px] mt-2 hover:text-red-600">删除</button>
                    </div>`;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p class="text-red-400 text-xs">加载失败</p>`;
        }
    }

    window.deleteRecord = async function(id) {
        if (!confirm('确定删除这条记录吗？')) return;
        try {
            await fetch(`/delete/${id}`, { method: 'DELETE' });
            loadHistory();
        } catch (err) {
            alert('删除失败');
        }
    };

    // 事件绑定
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

    // 语言切换
    langToggleBtn.addEventListener('click', async () => {
        if (!currentDisplayLang) return;
        const target = currentDisplayLang === 'zh' ? 'en' : 'zh';
        if (translationCache[target]) {
            resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-sm">${translationCache[target]}</pre>`;
            currentDisplayLang = target;
            return;
        }
        // 翻译逻辑保持你原来的
        statusText.innerHTML = "翻译中...";
        try {
            const res = await fetch('/translate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: translationCache[currentDisplayLang], target: target})
            });
            const data = await res.json();
            if (data.success) {
                translationCache[target] = data.text;
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-sm">${data.text}</pre>`;
                currentDisplayLang = target;
            }
        } catch (e) {}
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText || '').then(() => {
            const orig = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = orig, 1500);
        });
    });

    // 页面加载时加载历史记录
    loadHistory();
});
