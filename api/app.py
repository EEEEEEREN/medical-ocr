import os
import requests
import base64
import json
import random
from hashlib import md5
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# 获取并自动清理环境变量
def get_env(name):
    val = os.environ.get(name, '')
    return val.strip()

AK = get_env('BAIDU_OCR_AK')
SK = get_env('BAIDU_OCR_SK')
TRANS_APPID = get_env('BAIDU_TRANS_APPID')
TRANS_KEY = get_env('BAIDU_TRANS_KEY')

def get_access_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    res = requests.post(url)
    return res.json().get("access_token")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    # ... 前面的 base64 转换和 token 获取 ...
    res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'})
    result = res.json()
    
    if 'words_result' in result:
        # 必须在这里把所有行拼接起来，绝不能放固定字符串
        full_text = "\n".join([item['words'] for item in result['words_result']])
        return jsonify({"success": True, "text": full_text})
    return jsonify({"success": False, "error": result.get("error_msg", "未知错误")})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        q = data.get('text', '').strip()
        if not q: return jsonify({"success": False, "error": "无文字"})

        salt = str(random.randint(32768, 65536))
        # 严格签名计算
        sign_str = TRANS_APPID + q + salt + TRANS_KEY
        sign = md5(sign_str.encode('utf-8')).hexdigest()

        params = {"q": q, "from": "auto", "to": data.get('target', 'en'), "appid": TRANS_APPID, "salt": salt, "sign": sign}
        res = requests.get("https://fanyi-api.baidu.com/api/trans/vip/translate", params=params)
        res_data = res.json()
        
        if "trans_result" in res_data:
            dst = "\n".join([item['dst'] for item in res_data['trans_result']])
            return jsonify({"success": True, "text": dst})
        return jsonify({"success": False, "error": f"翻译错误: {res_data.get('error_msg')}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
