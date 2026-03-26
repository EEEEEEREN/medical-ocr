import os
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import vercel_blob

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# 配置数据库 (Vercel Postgres 或其他)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}

db = SQLAlchemy(app)

# 模型定义
class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    ocr_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# 初始化表
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    file = request.files.get('file')
    if not file:
        return jsonify({"success": False, "error": "请选择图片文件"})
    
    try:
        img_data = file.read()
        # 1. 保存到 Vercel Blob
        blob_path = f"medical/{uuid.uuid4()}-{file.filename}"
        blob_info = vercel_blob.put(blob_path, img_data, {"access": "public"})
        
        # 2. 调用百度 OCR
        from aip import AipOcr
        APP_ID = os.environ.get('BAIDU_APP_ID', '').strip()
        AK = os.environ.get('BAIDU_OCR_AK', '').strip()
        SK = os.environ.get('BAIDU_OCR_SK', '').strip()
        client = AipOcr(APP_ID, AK, SK)
        
        res = client.basicGeneral(img_data)
        if 'words_result' in res:
            ocr_text = "\n".join([w['words'] for w in res['words_result']])
            
            # 3. 存入数据库
            new_record = MedicalRecord(
                filename=file.filename,
                file_url=blob_info['url'],
                ocr_text=ocr_text
            )
            db.session.add(new_record)
            db.session.commit()
            
            return jsonify({"success": True, "text": ocr_text, "file_url": blob_info['url'], "id": new_record.id})
        else:
            return jsonify({"success": False, "error": res.get("error_msg", "识别引擎未返回结果")})
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/history', methods=['GET'])
def get_history():
    try:
        records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(20).all()
        return jsonify({
            "success": True,
            "records": [{
                "id": r.id,
                "filename": r.filename,
                "ocr_text": r.ocr_text,
                "created_at": r.created_at.isoformat()
            } for r in records]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/delete/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    try:
        record = MedicalRecord.query.get(record_id)
        if record:
            db.session.delete(record)
            db.session.commit()
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "记录不存在"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json or {}
    text = data.get('text', '')
    target = data.get('target', 'en')
    if not text: return jsonify({"success": False, "error": "内容为空"})

    try:
        from tencentcloud.common import credential
        from tencentcloud.tmt.v20180321 import tmt_client, models
        cred = credential.Credential(os.environ.get('TENCENT_SECRET_ID'), os.environ.get('TENCENT_SECRET_KEY'))
        client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText, req.Source, req.Target, req.ProjectId = text, "auto", target, 0
        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

app = app
