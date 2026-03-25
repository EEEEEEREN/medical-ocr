// 状态管理
let translationCache = { zh: '', en: '' };
let currentDisplayLang = 'zh';
let lastRecordId = null; // 关键：记录当前病例在数据库中的 ID

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const statusText = document.querySelector('#dropzone p');
const resultContent = document.getElementById('result-content');
const langToggleBtn = document.getElementById('output-lang-toggle');

// 文件上传处理
async function handleFile(file) {
    if (!file) return;
    
    // 界面重置
    statusText.innerText = "正在分析并存档...";
    resultContent.innerHTML = '<div class="animate-spin text-blue-600">⌛</div>';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/ocr', { method: 'POST', body: formData });
        const data = await response.json();

        if (data.success) {
            lastRecordId = data.record_id; // 存下数据库 ID
            translationCache.zh = data.text;
            translationCache.en = ''; // 清空之前的翻译
            currentDisplayLang = 'zh';
            
            updateDisplay(data.text);
            statusText.innerText = "已识别并安全存入数据库";
            console.log("云端图片地址:", data.image_url);
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        statusText.innerText = "识别失败，请重试";
        resultContent.innerText = "错误: " + err.message;
    }
}

// 翻译与切换逻辑
langToggleBtn.addEventListener('click', async () => {
    const targetLang = currentDisplayLang === 'zh' ? 'en' : 'zh';
    
    // 如果缓存里没翻译过，则请求后端
    if (!translationCache[targetLang]) {
        statusText.innerText = "正在请求翻译服务...";
        const response = await fetch('/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: translationCache[currentDisplayLang], 
                target: targetLang,
                record_id: lastRecordId // 告诉后端更新哪一行
            })
        });
        const data = await response.json();
        if (data.success) {
            translationCache[targetLang] = data.text;
        }
    }
    
    currentDisplayLang = targetLang;
    updateDisplay(translationCache[currentDisplayLang]);
    statusText.innerText = "语言已切换";
});

function updateDisplay(text) {
    resultContent.innerHTML = `<pre class="whitespace-pre-wrap text-sm leading-relaxed text-left w-full">${text}</pre>`;
}

// 拖拽与点击事件省略（保持原有逻辑即可）
dropzone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFile(e.target.files[0]);
