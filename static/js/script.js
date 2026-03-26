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

    // =============== 主题切换 ===============
    function updateThemeIcons() {
        if (document.documentElement.classList.contains('dark')) {
            themeToggleDarkIcon.classList.remove('hidden');
            themeToggleLightIcon.classList.add('hidden');
        } else {
            themeToggleLightIcon.classList.remove('hidden');
            themeToggleDarkIcon.classList.add('hidden');
        }
    }

    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeIcons();

    themeToggleBtn.addEventListener('click', function() {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('color-theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('color-theme', 'dark');
        }
        updateThemeIcons();
    });

    // =============== 上传与识别逻辑 ===============
    function updateDisplay(text) {
        resultContent.innerHTML = text ? text : '<div class="text-gray-400 italic text-center mt-10">内容为空</div>';
    }

    async function handleFile(file) {
        if (!file) return;

        // 预览图片
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // 重置状态
        translationCache = { 'zh': '', 'en': '' };
        currentDisplayLang = '';
        currentFileUrl = '';
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在上传并解析图片，请稍候...";
        updateDisplay('');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                translationCache['zh'] = data.text;
                currentDisplayLang = 'zh';
                currentFileUrl = data.file_url || '';
                updateDisplay(data.text);
                statusText.innerText = "✅ 识别完成！";
                setTimeout(() => statusBar.classList.add('hidden'), 3000);
                
                // 刷新历史记录
                loadHistory();
            } else {
                statusText.innerText = `❌ 失败: ${data.error}`;
                updateDisplay(`[错误信息]\n${data.error}`);
            }
        } catch (error) {
            console.error('Error:', error);
            statusText.innerText = "❌ 网络或服务器错误";
            updateDisplay(`[系统错误]\n请检查网络连接或控制台日志。\n${error.message}`);
        }
    }

    // 拖拽事件绑定
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
            dropzone.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
            dropzone.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            fileInput.files = e.dataTransfer.files;
            handleFile(file);
        } else {
            alert('请上传图片文件');
        }
    });

    dropzone.addEventListener('click', (e) => {
        if (e.target !== selectFileBtn) {
            fileInput.click();
        }
    });

    selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            handleFile(this.files[0]);
        }
    });

    // =============== 翻译功能 ===============
    langToggleBtn.addEventListener('click', async () => {
        if (!translationCache['zh']) {
            alert('请先上传图片进行识别！');
            return;
        }

        const targetLang = currentDisplayLang === 'zh' ? 'en' : 'zh';
        
        if (translationCache[targetLang]) {
            updateDisplay(translationCache[targetLang]);
            currentDisplayLang = targetLang;
            statusBar.classList.remove('hidden');
            statusText.innerText = `✅ 已切换至${targetLang === 'zh' ? '中文' : '英文'}`;
            setTimeout(() => statusBar.classList.add('hidden'), 2000);
            return;
        }

        statusBar.classList.remove('hidden');
        statusText.innerText = "正在调用翻译引擎，请稍候...";
        
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: translationCache[currentDisplayLang], 
                    target: targetLang 
                })
            });
            const data = await response.json();
            if (data.success) {
                translationCache[targetLang] = data.text;
                updateDisplay(data.text);
                currentDisplayLang = targetLang;
                statusText.innerText = "✅ 翻译完成！";
                setTimeout(() => statusBar.classList.add('hidden'), 2000);
            } else {
                statusText.innerText = `❌ 翻译失败: ${data.error}`;
            }
        } catch (err) {
            statusText.innerText = "❌ 翻译请求异常";
        }
    });

    // =============== 复制功能 ===============
    copyBtn.addEventListener('click', () => {
        const textToCopy = resultContent.innerText || '';
        if (!textToCopy.trim() || textToCopy.includes('暂无识别数据')) {
            alert('没有可复制的内容！');
            return;
        }
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 已复制';
            setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
        }).catch(err => {
            alert('复制失败，请手动选择复制');
        });
    });

    // =============== 历史记录加载与查看 ===============
    async function loadHistory() {
        const historyList = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();
            
            if (data.success) {
                if (!data.records || data.records.length === 0) {
                    historyList.innerHTML = '<div class="text-center text-sm text-gray-400 mt-10">暂无历史记录</div>';
                    return;
                }
                
                historyList.innerHTML = data.records.map(rec => {
                    const dateStr = rec.created_at.split(' ')[0]; // 只显示日期，省空间
                    // 【新增】 加入了一个隐藏的删除按钮，group-hover 时显示
                    return `
                        <div class="group relative history-item p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 cursor-pointer overflow-hidden" onclick="viewHistoryItem(this, '${encodeURIComponent(rec.ocr_text || '')}', '${rec.file_url || ''}')">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-[10px] text-gray-400 font-medium">${dateStr}</span>
                                <button onclick="deleteRecord(event, ${rec.id})" class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all" title="删除记录">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title="${rec.filename}">${rec.filename}</p>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                historyList.innerHTML = '<div class="text-center text-sm text-red-400 mt-10">加载失败</div>';
            }
        } catch (e) {
            console.error("历史加载失败:", e);
            historyList.innerHTML = '<div class="text-center text-sm text-red-400 mt-10">网络错误</div>';
        }
    }

    // 点击历史记录查看
    window.viewHistoryItem = function(element, encodedText, fileUrl) {
        // 高亮当前选中的条目
        document.querySelectorAll('.history-item').forEach(el => {
            el.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        });
        element.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');

        const text = decodeURIComponent(encodedText);
        translationCache = { 'zh': text, 'en': '' };
        currentDisplayLang = 'zh';
        updateDisplay(text);
        
        if (fileUrl) {
            previewImage.src = fileUrl;
            previewContainer.classList.remove('hidden');
        } else {
            previewContainer.classList.add('hidden');
        }
    };

    // 【新增】 删除历史记录
    window.deleteRecord = async function(event, id) {
        // 阻止点击事件冒泡到外层的 viewHistoryItem
        event.stopPropagation(); 
        
        if (!confirm('确定要永久删除这条记录吗？')) return;
        
        try {
            const res = await fetch(`/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            
            if (data.success) {
                // 删除成功后重新加载列表
                loadHistory(); 
            } else {
                alert('删除失败: ' + data.error);
            }
        } catch (e) {
            alert('删除请求异常');
            console.error(e);
        }
    };

    // 绑定刷新按钮
    const refreshBtn = document.getElementById('refresh-history');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const icon = refreshBtn.querySelector('svg');
            icon.classList.add('animate-spin');
            loadHistory().then(() => {
                setTimeout(() => icon.classList.remove('animate-spin'), 500);
            });
        });
    }

    // 页面加载时自动获取历史记录
    loadHistory();
});
