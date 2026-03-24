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

# 百度 OCR 密钥（保持不变，用于识图）
AK = get_env('BAIDU_OCR_AK')
SK = get_env('BAIDU_OCR_SK')

# 腾讯云翻译密钥（子账号 API 密钥，用于机器翻译）
TENCENT_ID = get_env('TENCENT_SECRET_ID')
TENCENT_KEY = get_env('TENCENT_SECRET_KEY')

def get_baidu_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    try:
        res = requests.post(url, timeout=10)
        return res.json().get("access_token")
    except Exception as e:
        print(f"获取百度Token失败: {e}")
        return None

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
        if not token: return jsonify({"success": False, "error": "OCR 认证失败"})
        
        # 使用通用文字识别（高精度版）
        api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'}, timeout=15)
        result = res.json()
        
        if 'words_result' in result:
            # 动态拼接识别到的每一行文字
            full_text = "\n".join([item['words'] for item in result['words_result']])
            return jsonify({"success": True, "text": full_text})
        
        return jsonify({"success": False, "error": result.get("error_msg", "识图失败")})
    except Exception as e:
        return jsonify({"success": False, "error": f"OCR服务异常: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        q = data.get('text', '').strip()
        target_lang = data.get('target', 'en') # 默认转英文

        if not q: return jsonify({"success": False, "error": "待翻译内容为空"})

        # 使用腾讯云官方 SDK 调用
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou") # 地域设为广州

        req = models.TextTranslateRequest()
        req.SourceText = q
        req.Source = "auto"   # 自动识别源语言（中英皆可）
        req.Target = target_lang
        req.ProjectId = 0

        resp = client.TextTranslate(req)
        # 腾讯云直接返回 TargetText 字段
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        # 这里会打印出非常详细的腾讯云错误原因，方便排查
        return jsonify({"success": False, "error": f"腾讯云机器翻译报错: {str(e)}"})
