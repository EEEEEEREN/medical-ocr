import os, base64, requests
from flask import Flask, render_template, request, jsonify
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__, template_folder='../templates', static_folder='../static')

TENCENT_ID = os.environ.get('TENCENT_SECRET_ID', '').strip()
TENCENT_KEY = os.environ.get('TENCENT_SECRET_KEY', '').strip()
BAIDU_AK = os.environ.get('BAIDU_OCR_AK', '').strip()
BAIDU_SK = os.environ.get('BAIDU_OCR_SK', '').strip()

def get_baidu_token():
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={BAIDU_AK}&client_secret={BAIDU_SK}"
    res = requests.post(url).json()
    return res.get("access_token")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    file = request.files.get('file')
    img_64 = base64.b64encode(file.read()).decode('utf-8')
    token = get_baidu_token()
    api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
    res = requests.post(api_url, data={"image": img_64}, headers={'content-type': 'application/x-www-form-urlencoded'}).json()
    if 'words_result' in res:
        full_text = "\n".join([i['words'] for i in res['words_result']])
        return jsonify({"success": True, "text": full_text})
    return jsonify({"success": False, "error": "识别失败"})

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json
    q = data.get('text', '')
    target = data.get('target', 'en')
    try:
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText, req.Source, req.Target, req.ProjectId = q, "auto", target, 0
        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
