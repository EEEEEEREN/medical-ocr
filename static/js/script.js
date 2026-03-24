class MedicalImageRecognizer {
    constructor() {
        this.initElements();
        this.initEventListeners();
        this.originalText = ""; 
        this.currentLang = "zh";
        this.initTheme();
    }

    initElements() {
        this.dropzone = document.getElementById('dropzone');
        this.fileInput = document.getElementById('file-input');
        this.selectFileBtn = document.getElementById('select-file-btn');
        this.previewContainer = document.getElementById('preview-container');
        this.previewImage = document.getElementById('preview-image');
        this.resultContent = document.getElementById('result-content');
        this.statusBar = document.getElementById('status-bar');
        this.statusText = document.getElementById('status-text');
        this.copyBtn = document.getElementById('copy-btn');
        this.outputLangToggle = document.getElementById('output-lang-toggle');
        this.themeToggle = document.getElementById('theme-toggle');
    }

    initEventListeners() {
        this.selectFileBtn.onclick = () => this.fileInput.click();
        this.fileInput.onchange = (e) => this.handleFileSelect(e.target.files[0]);
        this.outputLangToggle.onclick = () => this.toggleLanguage();
        this.themeToggle.onclick = () => this.toggleTheme();
        this.copyBtn.onclick = () => this.copyResult();
        
        // 拖拽逻辑
        this.dropzone.ondragover = (e) => { e.preventDefault(); this.dropzone.classList.add('drag-over'); };
        this.dropzone.ondragleave = () => this.dropzone.classList.remove('drag-over');
        this.dropzone.ondrop = (e) => {
            e.preventDefault();
            this.dropzone.classList.remove('drag-over');
            this.handleFileSelect(e.dataTransfer.files[0]);
        };
    }

    async handleFileSelect(file) {
        if (!file || !file.type.startsWith('image/')) return;
        
        // 显示预览
        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewImage.src = e.target.result;
            this.previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // OCR 识别
        this.statusBar.classList.remove('hidden');
        this.statusText.textContent = '正在识别文字...';
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                this.originalText = data.text;
                this.showTranslatedResult();
            } else {
                alert('识别失败: ' + data.error);
            }
        } catch (e) {
            alert('网络错误');
        } finally {
            this.statusBar.classList.add('hidden');
        }
    }

    async translate(text, targetLang) {
        try {
            const res = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, target: targetLang })
            });
            const data = await res.json();
            return data.text || text;
        } catch (e) {
            return text + "\n(翻译失败)";
        }
    }

    async toggleLanguage() {
        this.currentLang = this.currentLang === 'zh' ? 'en' : 'zh';
        document.getElementById('lang-text').textContent = this.currentLang === 'zh' ? '切换至英文' : '切换至中文';
        await this.showTranslatedResult();
    }

    async showTranslatedResult() {
        if (!this.originalText) return;
        this.statusBar.classList.remove('hidden');
        this.statusText.textContent = '翻译中...';
        
        const result = await this.translate(this.originalText, this.currentLang);
        let formatted = result.replace(/\n/g, '<br>');
        this.resultContent.innerHTML = `<div class="text-xs text-blue-500 mb-2 font-bold">当前显示：${this.currentLang === 'zh' ? '中文' : '英文'}</div>` + 
                                      `<div class="leading-relaxed">${formatted}</div>`;
        this.statusBar.classList.add('hidden');
    }

    copyResult() {
        navigator.clipboard.writeText(this.resultContent.innerText);
        alert('已复制到剪贴板');
    }

    toggleTheme() {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }

    initTheme() {
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    }
}

new MedicalImageRecognizer();
