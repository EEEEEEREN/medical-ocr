import os
import base64
import requests
import json
from flask import Flask, render_template, request, jsonify
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

def get_env(name):
    return os.environ.get(name, '').strip()

# 百度 OCR 密钥（保持不变用于识图）
AK = get_env('BAIDU_OCR_AK')
SK = get_env('BAIDU_OCR_SK')

# 腾讯云翻译密钥（子账号 API 密钥）
TENCENT_ID = get_env('TENCENT_SECRET_ID')
TENCENT_KEY = get_env('TENCENT_SECRET_KEY')

def get_baidu_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    res = requests.post(url)
    return res.json().get("access_token")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        file = request.files.get('file')
        if not file: return jsonify({"success": False, "error": "未收到文件"})
        
        img_64 = base64.b64encode(file.read()).decode('utf-8')
        token = get_baidu_token()
        
        # 使用高精度 OCR 接口
        api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'})
        result = res.json()
        
        if 'words_result' in result:
            full_text = "\n".join([item['words'] for item in result['words_result']])
            return jsonify({"success": True, "text": full_text})
        return jsonify({"success": False, "error": "识图失败"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        q = data.get('text', '').strip()
        target_lang = data.get('target', 'en') # 默认转英文

        if not q: return jsonify({"success": False, "error": "翻译内容为空"})

        # 腾讯云 SDK 调用逻辑
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou") 

        req = models.TextTranslateRequest()
        req.SourceText = q
        req.Source = "auto"   # 自动识别源语言（中英皆可）
        req.Target = target_lang
        req.ProjectId = 0

        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": f"腾讯云机器翻译报错: {str(e)}"})
