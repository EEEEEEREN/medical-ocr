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

# 配置
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 模型
class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    ocr_text = db.Column(db.Text, nullable=True)
    language = db.Column(db.String(10), default='zh')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/history', methods=['GET'])
def get_history():
    try:
        records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(20).all()
        return jsonify({
            "success": True,
            "records": [{"id": r.id, "filename": r.filename, "created_at": r.created_at.isoformat(), "ocr_text": r.ocr_text} for r in records]
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
        return jsonify({"success": False, "error": "未找到记录"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# ... 保持之前的 /ocr 和 /translate 逻辑不变 ...

app = app
