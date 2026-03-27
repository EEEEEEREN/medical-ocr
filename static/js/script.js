document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const dropzone = document.getElementById('dropzone');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const resultContent = document.getElementById('result-content');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const copyBtn = document.getElementById('copy-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');

    let currentFileUrl = '';

    // 主题切换
    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
    });

    // 处理文件上传
    async function handleFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        resultContent.innerHTML = `<div class="h-full flex items-center justify-center"><p class="text-blue-600 animate-pulse">正在识别中...</p></div>`;
        statusBar.classList.remove('hidden');
        statusText.textContent = "正在调用 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                currentFileUrl = data.file_url || '';
                resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-gray-800 dark:text-gray-200">${data.text}</pre>`;

                let msg = '✅ 已识别并保存到数据库';
                if (currentFileUrl) msg += ` <a href="${currentFileUrl}" target="_blank" class="text-blue-600 underline">查看原图</a>`;
                statusText.innerHTML = msg;

                loadHistory();   // 自动刷新历史
            } else {
                statusText.textContent = "识别失败";
            }
        } catch (err) {
            statusText.textContent = "网络错误";
        }
    }

    // 历史记录
    async function loadHistory() {
        const container = document.getElementById('history-list');
        try {
            const res = await fetch('/history');
            const data = await res.json();

            if (!data.records || data.records.length === 0) {
                container.innerHTML = `<p class="text-gray-400 text-center py-8">暂无历史记录</p>`;
                return;
            }

            let html = '';
            data.records.forEach(record => {
                const date = new Date(record.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="history-item bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <div class="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>${date}</span>
                            <span>${record.language}</span>
                        </div>
                        <div class="text-xs font-medium mb-1">${record.filename}</div>
                        ${record.file_url ? `<a href="${record.file_url}" target="_blank" class="text-blue-600 text-[10px] hover:underline">查看原图</a>` : ''}
                        <button onclick="deleteRecord(${record.id})" class="mt-2 text-red-500 text-[10px] hover:text-red-600">删除</button>
                    </div>`;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p class="text-red-400">加载失败</p>`;
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

    // 复制按钮
    copyBtn.addEventListener('click', () => {
        const text = resultContent.innerText || '';
        navigator.clipboard.writeText(text).then(() => {
            const orig = copyBtn.innerText;
            copyBtn.innerText = '已复制';
            setTimeout(() => copyBtn.innerText = orig, 1500);
        });
    });

    // 页面加载时加载历史
    loadHistory();
});
