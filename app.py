from flask import Flask, render_template, request, jsonify
import requests
import base64
import os
import hashlib
import random

app = Flask(__name__)

# 从环境变量读取配置，保护隐私
AK = os.environ.get('BAIDU_OCR_AK') 
SK = os.environ.get('BAIDU_OCR_SK')
TRANS_APPID = os.environ.get('BAIDU_TRANS_APPID') 
TRANS_KEY = os.environ.get('BAIDU_TRANS_KEY')

TOKEN = None

def get_access_token():
    global TOKEN
    if TOKEN: return TOKEN
    if not AK or not SK: return None
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={AK}&client_secret={SK}"
    try:
        resp = requests.post(url)
        data = resp.json()
        if "access_token" in data:
            TOKEN = data["access_token"]
            return TOKEN
    except:
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    file = request.files.get('file')
    if not file: return jsonify({"error": "未收到文件"}), 400
    
    img_data = file.read()
    image_base64 = base64.b64encode(img_data).decode('utf-8')

    try:
        token = get_access_token()
        if not token: return jsonify({"error": "OCR授权失败，请检查环境变量"}), 500
        
        url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        payload = f"image={requests.utils.quote(image_base64)}"
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        resp = requests.post(url, data=payload, headers=headers)
        result = resp.json()

        if "words_result" in result:
            texts = [item["words"] for item in result["words_result"]]
            return jsonify({"success": True, "text": "\n".join(texts)})
        return jsonify({"error": "图片识别失败"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json
    text = data.get('text', '')
    target = data.get('target', 'zh')
    
    if not text or not TRANS_APPID or not TRANS_KEY: 
        return jsonify({"text": text})

    salt = str(random.randint(32768, 65536))
    sign_str = TRANS_APPID + text + salt + TRANS_KEY
    sign = hashlib.md5(sign_str.encode('utf-8')).hexdigest()
    
    url = "https://fanyi-api.baidu.com/api/trans/vip/translate"
    params = {"q": text, "from": "auto", "to": target, "appid": TRANS_APPID, "salt": salt, "sign": sign}
    
    try:
        resp = requests.get(url, params=params)
        res_data = resp.json()
        if 'trans_result' in res_data:
            translated_text = "\n".join([i['dst'] for i in res_data['trans_result']])
            return jsonify({"text": translated_text})
    except:
        pass
    return jsonify({"text": text + "\n(翻译功能配置有误或暂不可用)"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
