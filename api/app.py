import os
import base64
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

import vercel_blob

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# ==================== 配置 ====================
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}

db = SQLAlchemy(app)

# Tencent Translate 配置
TENCENT_ID = os.environ.get('TENCENT_SECRET_ID', '').strip()
TENCENT_KEY = os.environ.get('TENCENT_SECRET_KEY', '').strip()

# Baidu OCR 配置
BAIDU_AK = os.environ.get('BAIDU_OCR_AK', '').strip()
BAIDU_SK = os.environ.get('BAIDU_OCR_SK', '').strip()

# ==================== 数据库模型 ====================
class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)        # Vercel Blob URL
    ocr_text = db.Column(db.Text, nullable=True)
    language = db.Column(db.String(10), default='zh')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# 初始化表结构（如果不存在）
with app.app_context():
    db.create_all()

# ==================== 路由 ====================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "没有找到文件"})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "文件名为空"})

    try:
        # 1. 存入 Vercel Blob
        file_content = file.read()
        blob_name = f"medical_uploads/{uuid.uuid4().hex}_{file.filename}"
        blob_info = vercel_blob.put(blob_name, file_content, options={"access": "public"})
        file_url = blob_info.get("url")

        # 2. 调用百度 OCR
        try:
            from aip import AipOcr
            client = AipOcr(os.environ.get('BAIDU_APP_ID', '').strip(), BAIDU_AK, BAIDU_SK)
            res = client.basicGeneral(file_content)
            
            if "words_result" in res:
                detected_text = "\n".join([w["words"] for w in res["words_result"]])
                detected_lang = "zh" # 默认假设中文，后续可根据需求扩展语种检测
                
                # 3. 存入数据库
                record = MedicalRecord(
                    filename=file.filename,
                    file_url=file_url,
                    ocr_text=detected_text,
                    language=detected_lang
                )
                db.session.add(record)
                db.session.commit()

                return jsonify({
                    "success": True, 
                    "text": detected_text, 
                    "file_url": file_url,
                    "record_id": record.id,
                    "language": detected_lang
                })
            else:
                return jsonify({"success": False, "error": res.get("error_msg", "识别失败")})
        except Exception as e:
            return jsonify({"success": False, "error": f"OCR调用失败: {str(e)}"})

    except Exception as e:
        return jsonify({"success": False, "error": f"文件处理失败: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate():
    data = request.json or {}
    q = data.get('text', '')
    target = data.get('target', 'en')
    if not q:
        return jsonify({"success": False, "error": "内容为空"})

    try:
        from tencentcloud.common import credential
        from tencentcloud.tmt.v20180321 import tmt_client, models
        cred = credential.Credential(TENCENT_ID, TENCENT_KEY)
        client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText = q
        req.Source = "auto"
        req.Target = target
        req.ProjectId = 0
        resp = client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/history', methods=['GET'])
def get_history():
    try:
        records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(50).all()
        return jsonify({
            "success": True,
            "count": len(records),
            "records": [{
                "id": r.id,
                "filename": r.filename,
                "file_url": r.file_url,
                "ocr_text": r.ocr_text,
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S")
            } for r in records]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# 【新增】删除历史记录接口
@app.route('/delete/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    try:
        record = MedicalRecord.query.get(record_id)
        if not record:
            return jsonify({"success": False, "error": "记录不存在"})
        
        db.session.delete(record)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

app = app
