import os
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from vercel_blob import put

# 百度 OCR 引入
try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

# 腾讯翻译引入
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# ==================== 配置 ====================
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

TENCENT_ID = os.environ.get('TENCENT_SECRET_ID', '')
TENCENT_KEY = os.environ.get('TENCENT_SECRET_KEY', '')
BAIDU_APP_ID = os.environ.get('BAIDU_APP_ID', '')
BAIDU_AK = os.environ.get('BAIDU_OCR_AK', '')
BAIDU_SK = os.environ.get('BAIDU_OCR_SK', '')

# ==================== 数据库模型 ====================
class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    ocr_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# 初始化数据库
with app.app_context():
    db.create_all()

# ==================== 路由逻辑 ====================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    try:
        # 1. 上传到 Vercel Blob
        blob_name = f"medical/{uuid.uuid4()}-{file.filename}"
        blob_res = put(blob_name, img_data, {"access": "public"})
        file_url = blob_res['url']

        # 2. 百度 OCR
        client = AipOcr(BAIDU_APP_ID, BAIDU_AK, BAIDU_SK)
        res = client.basicGeneral(img_data)
        ocr_text = "\n".join([item['words'] for item in res.get('words_result', [])])

        # 3. 存入数据库
        record = MedicalRecord(filename=file.filename, file_url=file_url, ocr_text=ocr_text)
        db.session.add(record)
        db.session.commit()

        return jsonify({"success": True, "text": ocr_text, "image_url": file_url, "record_id": record.id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.json
    try:
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText = data.get('text')
        req.Source, req.Target = ("zh", "en") if data.get('target') == "en" else ("en", "zh")
        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/history', methods=['GET'])
def get_history():
    records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(20).all()
    return jsonify({
        "success": True,
        "records": [{"id": r.id, "filename": r.filename, "created_at": r.created_at.isoformat(), "ocr_text": r.ocr_text} for r in records]
    })

@app.route('/delete/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    record = MedicalRecord.query.get(record_id)
    if record:
        db.session.delete(record)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "记录不存在"})

app = app
