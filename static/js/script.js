// 全选覆盖 static/js/script.js
const fileInput = document.getElementById('fileInput');
const resultText = document.getElementById('resultText');
const currentLangSpans = document.querySelectorAll('.current-lang');
const translateBtn = document.getElementById('translateBtn');

let currentOcrText = ''; // 存储动态识别出的文字
let showingTranslated = false; // 状态标记

// 1. 上传与识别
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 清空状态和显示
    currentOcrText = '';
    showingTranslated = false;
    resultText.value = '正在识别...';
    translateBtn.innerText = '切换至英文';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/ocr', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            currentOcrText = data.text; // 拿到真正的识别文字
            resultText.value = data.text;
            // 更新语言显示为中文
            currentLangSpans.forEach(span => span.innerText = '中文');
        } else {
            resultText.value = 'OCR 识别失败: ' + (data.error || '未知错误');
        }
    } catch (err) {
        console.error('OCR请求崩溃:', err);
        resultText.value = '请求接口崩溃，请检查Vercel Logs';
    }
});

// 2. 翻译与切换
translateBtn.addEventListener('click', async () => {
    // 确保有文字可翻
    if (!currentOcrText || currentOcrText.includes('正在识别') || currentOcrText.includes('OCR 识别失败')) {
        return;
    }

    if (!showingTranslated) {
        // 准备转英文
        resultText.value = '正在翻译...';
        
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentOcrText, // 必须传动态 OCR 的文字
                    target: 'en'
                })
            });
            const data = await response.json();

            if (data.success) {
                resultText.value = data.text; // 拿到真实的英文翻译
                translateBtn.innerText = '切换至中文原件';
                currentLangSpans.forEach(span => span.innerText = '英文');
                showingTranslated = true;
            } else {
                resultText.value = '翻译失败: ' + (data.error || '未知错误');
                // 自动跳回中文显示
                resultText.value += '\n---\n已恢复原件：\n' + currentOcrText;
            }
        } catch (err) {
            console.error('翻译请求崩溃:', err);
            resultText.value = '翻译请求崩溃，请检查 Console';
        }
    } else {
        // 已是英文，切回中文原件
        resultText.value = currentOcrText;
        translateBtn.innerText = '切换至英文';
        currentLangSpans.forEach(span => span.innerText = '中文');
        showingTranslated = false;
    }
});
