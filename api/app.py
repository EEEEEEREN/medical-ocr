import os
import base64
import requests
from flask import Flask, render_template, request, jsonify
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# 获取环境变量
def get_env(name):
    return os.environ.get(name, '').strip()

# 百度 OCR 密钥（保持不变）
AK = get_env('BAIDU_OCR_AK')
SK = get_env('BAIDU_OCR_SK')

# 腾讯云翻译密钥
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
        img_64 = base64.b64encode(file.read()).decode('utf-8')
        token = get_baidu_token()
        api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'})
        result = res.json()
        if 'words_result' in result:
            full_text = "\n".join([item['words'] for item in result['words_result']])
            return jsonify({"success": True, "text": full_text})
        return jsonify({"success": False, "error": "OCR 识别失败"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        q = data.get('text', '').strip()
        if not q: return jsonify({"success": False, "error": "内容为空"})

        # 使用腾讯云官方 SDK 调用
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou") # 地域选广州即可

        req = models.TextTranslateRequest()
        req.SourceText = q
        req.Source = "auto"
        req.Target = "en"
        req.ProjectId = 0

        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        # 这里会打印出非常详细的错误原因
        return jsonify({"success": False, "error": f"腾讯云报错: {str(e)}"})
