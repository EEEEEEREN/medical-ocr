import os
import requests
import base64
import json
import random
from hashlib import md5
from flask import Flask, render_template, request, jsonify

# 必须指定静态文件和模板的相对路径
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

# 自动处理环境变量中的首尾空格（防止粘贴 Key 时多出空格）
def get_env(name):
    return os.environ.get(name, '').strip()

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
    try:
        file = request.files.get('file')
        if not file: return jsonify({"success": False, "error": "未收到图片文件"})
        
        img_64 = base64.b64encode(file.read()).decode('utf-8')
        token = get_access_token()
        
        # 使用通用文字识别（高精度版）
        api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'})
        result = res.json()
        
        if 'words_result' in result:
            # 动态拼接所有识别到的文字行
            full_text = "\n".join([item['words'] for item in result['words_result']])
            return jsonify({"success": True, "text": full_text})
        
        return jsonify({"success": False, "error": result.get("error_msg", "OCR 识别失败")})
    except Exception as e:
        return jsonify({"success": False, "error": f"服务器内部错误: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        q = data.get('text', '').strip()
        if not q: return jsonify({"success": False, "error": "待翻译文本为空"})

        salt = str(random.randint(32768, 65536))
        # 严格按照百度签名公式：appid+q+salt+key
        sign_str = TRANS_APPID + q + salt + TRANS_KEY
        sign = md5(sign_str.encode('utf-8')).hexdigest()

        params = {
            "q": q,
            "from": "auto",
            "to": data.get('target', 'en'),
            "appid": TRANS_APPID,
            "salt": salt,
            "sign": sign
        }
        
        res = requests.get("https://fanyi-api.baidu.com/api/trans/vip/translate", params=params)
        res_data = res.json()
        
        if "trans_result" in res_data:
            dst = "\n".join([item['dst'] for item in res_data['trans_result']])
            return jsonify({"success": True, "text": dst})
        
        # 返回百度具体的错误信息
        return jsonify({"success": False, "error": f"百度翻译报错: {res_data.get('error_msg')}"})
    except Exception as e:
        return jsonify({"success": False, "error": f"翻译接口崩溃: {str(e)}"})

# 必须保留，供 Vercel 调用
if __name__ == '__main__':
    app.run()
