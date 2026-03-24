import os, base64, requests
from flask import Flask, render_template, request, jsonify
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__, template_folder='../templates', static_folder='../static')

def get_env(key):
    return os.environ.get(key, '').strip()

TENCENT_ID = get_env('TENCENT_SECRET_ID')
TENCENT_KEY = get_env('TENCENT_SECRET_KEY')
BAIDU_AK = get_env('BAIDU_OCR_AK')
BAIDU_SK = get_env('BAIDU_OCR_SK')

def get_baidu_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={BAIDU_AK}&client_secret={BAIDU_SK}"
    try:
        res = requests.post(url, timeout=10).json()
        return res.get("access_token")
    except:
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "无文件"})
    img_64 = base64.b64encode(file.read()).decode('utf-8')
    token = get_baidu_token()
    if not token: return jsonify({"success": False, "error": "鉴权失败"})
    api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
    res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'}, timeout=15).json()
    if 'words_result' in res:
        full_text = "\n".join([i['words'] for i in res['words_result']])
        return jsonify({"success": True, "text": full_text})
    return jsonify({"success": False, "error": res.get("error_msg", "识别失败")})

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json
    q, target = data.get('text', ''), data.get('target', 'en')
    if not q: return jsonify({"success": False, "error": "内容为空"})
    try:
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText, req.Source, req.Target, req.ProjectId = q, "auto", target, 0
        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)
