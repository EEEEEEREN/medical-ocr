import os
import requests
import base64
import json
import random
from hashlib import md5
from flask import Flask, render_template, request, jsonify

# 这里的路径确保 Vercel 能在 api 文件夹外找到 static 和 templates
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

# 获取环境变量
AK = os.environ.get('BAIDU_OCR_AK')
SK = os.environ.get('BAIDU_OCR_SK')
TRANS_APPID = os.environ.get('BAIDU_TRANS_APPID')
TRANS_KEY = os.environ.get('BAIDU_TRANS_KEY')

def get_access_token():
    """获取百度 OCR 访问凭证"""
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    try:
        response = requests.post(url)
        return response.json().get("access_token")
    except:
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    """真实 OCR 识别逻辑"""
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({"success": False, "error": "未收到图片"})
        
        img_base = base64.b64encode(file.read()).decode('utf-8')
        token = get_access_token()
        if not token:
            return jsonify({"success": False, "error": "无法获取百度授权，请检查 OCR Key"})

        api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        response = requests.post(api_url, data={"image": img_base}, headers={'content-type': 'application/x-www-form-urlencoded'})
        result = response.json()
        
        if 'words_result' in result:
            full_text = "\n".join([item['words'] for item in result['words_result']])
            return jsonify({"success": True, "text": full_text})
        return jsonify({"success": False, "error": "识别失败：" + str(result.get("error_msg", "未知错误"))})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate():
    """真实百度翻译逻辑"""
    try:
        data = request.json
        q = data.get('text', '')
        to_lang = data.get('target', 'en')
        
        if not q:
            return jsonify({"success": False, "error": "无文字可翻"})

        # 百度翻译签名计算
        salt = str(random.randint(32768, 65536))
        sign = md5((TRANS_APPID + q + salt + TRANS_KEY).encode('utf-8')).hexdigest()

        params = {
            "q": q, "from": "auto", "to": to_lang,
            "appid": TRANS_APPID, "salt": salt, "sign": sign
        }
        
        res = requests.get("https://fanyi-api.baidu.com/api/trans/vip/translate", params=params)
        res_data = res.json()
        
        if "trans_result" in res_data:
            dst = "\n".join([item['dst'] for item in res_data['trans_result']])
            return jsonify({"success": True, "text": dst})
        return jsonify({"success": False, "error": "翻译失败：" + str(res_data.get("error_msg"))})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
