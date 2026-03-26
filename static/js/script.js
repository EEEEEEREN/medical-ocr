document.addEventListener('DOMContentLoaded', () => {
    // 元素获取
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const dropzone = document.getElementById('dropzone');
    const resultContent = document.getElementById('result-content');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const themeToggle = document.getElementById('theme-toggle');
    const langToggleBtn = document.getElementById('output-lang-toggle');
    const statusBar = document.getElementById('status-bar');
    const copyBtn = document.getElementById('copy-btn');

    // 状态管理
    let translationCache = { 'zh': '', 'en': '' };
    let currentLang = 'zh';

    // 1. 修复上传按钮：直接绑定点击事件并阻止冒泡
    selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleUpload(e.target.files[0]);
        }
    });

    // 2. 主题切换逻辑
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    themeToggle.onclick = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.theme = isDark ? 'dark' : 'light';
    };

    // 3. 执行上传与识别
    async function handleUpload(file) {
        // 图片预览
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // UI 状态
        statusBar.classList.remove('hidden');
        resultContent.innerText = "AI 正在解析图片文字，请稍候...";
        translationCache = { 'zh': '', 'en': '' };

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                translationCache['zh'] = data.text;
                currentLang = 'zh';
                resultContent.innerText = data.text;
                loadHistory(); // 刷新右侧历史
            } else {
                resultContent.innerText = "识别失败: " + data.error;
            }
        } catch (e) {
            resultContent.innerText = "网络连接失败，请重试";
        } finally {
            statusBar.classList.add('hidden');
        }
    }

    // 4. 切换显示语言 (恢复原始逻辑)
    langToggleBtn.onclick = async () => {
        if (!translationCache['zh']) {
            alert("请先上传病例图片进行识别");
            return;
        }

        if (currentLang === 'zh') {
            // 如果没翻译过，则调用后端翻译
            if (!translationCache['en']) {
                statusBar.classList.remove('hidden');
                statusBar.innerText = "正在切换显示语言为英文...";
                try {
                    const res = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: translationCache['zh'], target: 'en' })
                    });
                    const data = await res.json();
                    if (data.success) {
                        translationCache['en'] = data.text;
                    }
                } catch (e) {
                    alert("语言切换失败，请检查网络");
                } finally {
                    statusBar.classList.add('hidden');
                    statusBar.innerText = "🚀 AI 正在处理您的医疗文档..."; // 还原文字
                }
            }
            if (translationCache['en']) {
                resultContent.innerText = translationCache['en'];
                currentLang = 'en';
            }
        } else {
            // 切回中文
            resultContent.innerText = translationCache['zh'];
            currentLang = 'zh';
        }
    };

    // 5. 复制功能
    copyBtn.onclick = () => {
        const text = resultContent.innerText;
        if (!text || text.includes("等待上传")) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "已复制 √";
            setTimeout(() => copyBtn.innerText = originalText, 1500);
        });
    };

    // 6. 历史记录展示与删除
    async function loadHistory() {
        const historyList = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();
            if (data.success) {
                if (data.records.length === 0) {
                    historyList.innerHTML = '<p class="text-center text-xs text-gray-400 mt-10">暂无历史记录</p>';
                    return;
                }
                historyList.innerHTML = data.records.map(rec => `
                    <div class="history-card group relative p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-transparent hover:border-blue-400 cursor-pointer transition-all" onclick="viewHistory('${encodeURIComponent(rec.ocr_text)}')">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">${rec.created_at.split('T')[0]}</span>
                            <button onclick="deleteRecord(event, ${rec.id})" class="delete-btn opacity-0 text-red-400 hover:text-red-600 transition-opacity p-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                        <p class="text-xs font-bold truncate text-gray-700 dark:text-gray-300">${rec.filename}</p>
                    </div>
                `).join('');
            }
        } catch (e) {
            historyList.innerHTML = '<p class="text-center text-xs text-red-400">列表加载异常</p>';
        }
    }

    window.viewHistory = (encodedText) => {
        const text = decodeURIComponent(encodedText);
        translationCache['zh'] = text;
        translationCache['en'] = '';
        currentLang = 'zh';
        resultContent.innerText = text;
        previewContainer.classList.add('hidden'); // 历史查看暂不展示预览图（除非后端存了URL）
    };

    window.deleteRecord = async (e, id) => {
        e.stopPropagation();
        if (!confirm("确定永久删除这条记录吗？")) return;
        try {
            const res = await fetch(`/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) loadHistory();
        } catch (e) {
            alert("删除失败");
        }
    };

    document.getElementById('refresh-history').onclick = loadHistory;

    // 首次加载历史
    loadHistory();
});
