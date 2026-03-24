import os
from flask import Flask, render_template, request, jsonify
import requests
import base64

# 特别注意：在 Vercel 环境下，需要指定 template_folder 路径
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

# 从环境变量获取 Key
AK = os.environ.get('BAIDU_OCR_AK')
SK = os.environ.get('BAIDU_OCR_SK')
TRANS_APPID = os.environ.get('BAIDU_TRANS_APPID')
TRANS_KEY = os.environ.get('BAIDU_TRANS_KEY')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    # ... 保持你之前的 OCR 逻辑不变 ...
    return jsonify({"success": True, "text": "识别成功示例"})

@app.route('/translate', methods=['POST'])
def translate():
    # ... 保持你之前的翻译逻辑不变 ...
    return jsonify({"success": True, "text": "Translation Example"})

# 【核心】在 Vercel 部署千万不要写 app.run()
# 只要导出 app 对象即可
