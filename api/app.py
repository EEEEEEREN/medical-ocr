import os
from flask import Flask, render_template, request, jsonify
import requests
import base64
import json

app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

# 获取环境变量
AK = os.environ.get('BAIDU_OCR_AK')
SK = os.environ.get('BAIDU_OCR_SK')
TRANS_APPID = os.environ.get('BAIDU_TRANS_APPID')
TRANS_KEY = os.environ.get('BAIDU_TRANS_KEY')

def get_access_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    payload = json.dumps("")
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    response = requests.request("POST", url, headers=headers, data=payload)
    return response.json().get("access_token")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "没有文件"})
        
        file = request.files['file']
        img_base64 = base64.b64encode(file.read()).decode('utf-8')
        
        # 调用百度 OCR
        request_url = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"
        params = {"image": img_base64}
        access_token = get_access_token()
        request_url = request_url + "?access_token=" + access_token
        headers = {'content-type': 'application/x-www-form-urlencoded'}
        response = requests.post(request_url, data=params, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            full_text = "\n".join([line['words'] for line in result.get('words_result', [])])
            return jsonify({"success": True, "text": full_text})
        return jsonify({"success": False, "error": "OCR 接口请求失败"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        text = data.get('text')
        target_lang = data.get('target', 'en')
        
        # 百度翻译逻辑
        import random
        from hashlib import md5
        
        salt = str(random.randint(32768, 65536))
        sign = md5((TRANS_APPID + text + salt + TRANS_KEY).encode('utf-8')).hexdigest()
        
        url = "https://fanyi-api.baidu.com/api/trans/vip/translate"
        params = {
            "q": text, "from": "auto", "to": target_lang,
            "appid": TRANS_APPID, "salt": salt, "sign": sign
        }
        
        response = requests.get(url, params=params)
        res_data = response.json()
        
        if "trans_result" in res_data:
            translated_text = "\n".join([item['dst'] for item in res_data['trans_result']])
            return jsonify({"success": True, "text": translated_text})
        return jsonify({"success": False, "error": "翻译失败"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
