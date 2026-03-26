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

TENCENT_ID = os.environ.get('TENCENT_SECRET_ID', '').strip()
TENCENT_KEY = os.environ.get('TENCENT_SECRET_KEY', '').strip()
BAIDU_AK = os.environ.get('BAIDU_OCR_AK', '').strip()
BAIDU_SK = os.environ.get('BAIDU_OCR_SK', '').strip()

# ==================== 数据库模型 ====================
class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    ocr_text = db.Column(db.Text, nullable=True)
    language = db.Column(db.String(10), default='zh')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_url": self.file_url,
            "ocr_text": self.ocr_text,
            "language": self.language,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

with app.app_context():
    db.create_all()

# ==================== 工具函数 ====================
def get_baidu_token():
    if not BAIDU_AK or not BAIDU_SK:
        return None
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={BAIDU_AK}&client_secret={BAIDU_SK}"
    try:
        import requests
        res = requests.post(url, timeout=10).json()
        return res.get("access_token")
    except:
        return None

def upload_to_blob(file, filename):
    """上传到 Vercel Blob - 加强错误日志版"""
    try:
        ext = os.path.splitext(filename)[1].lower() or '.jpg'
        unique_name = f"medical/{datetime.utcnow().strftime('%Y%m%d')}/{uuid.uuid4().hex[:16]}{ext}"
        
        file.seek(0)
        file_bytes = file.read()

        print(f"📤 开始上传 Blob: {unique_name} | 大小: {len(file_bytes)} bytes")

        result = vercel_blob.put(
            unique_name,
            file_bytes,
            access='public',          # 先用 public 测试
            add_random_suffix=False
        )

        print(f"📥 vercel_blob.put 返回值类型: {type(result)}")
        print(f"📥 返回内容: {result}")

        # 处理不同可能的返回值
        if isinstance(result, dict):
            url = result.get('url') or result.get('downloadUrl') or str(result)
        else:
            url = str(result)

        if url and url.startswith('http'):
            print(f"✅ Blob 上传成功！URL: {url}")
            return url
        else:
            print(f"⚠️ 返回内容不是有效 URL: {url}")
            return None

    except Exception as e:
        print(f"❌ Blob 上传异常: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return None

# ==================== 路由 ====================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    file = request.files.get('file')
    if not file:
        return jsonify({"success": False, "error": "无文件"})

    original_filename = file.filename or "unknown"
    file_data = file.read()

    # 上传 Blob
    file.seek(0)
    file_url = upload_to_blob(file, original_filename)

    # OCR
    img_64 = base64.b64encode(file_data).decode('utf-8')
    token = get_baidu_token()
    if not token:
        return jsonify({"success": False, "error": "Baidu OCR 鉴权失败"})

    import requests
    api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
    res = requests.post(api_url, data={"image": img_64}, 
                       headers={'content-type': 'application/x-www-form-urlencoded'}, timeout=20).json()

    if 'words_result' in res:
        full_text = "\n".join([item.get('words', '') for item in res.get('words_result', [])])
        detected_lang = 'en' if full_text and (sum(1 for c in full_text if c.isascii()) / len(full_text) > 0.4) else 'zh'

        record = MedicalRecord(
            filename=original_filename,
            file_url=file_url,
            ocr_text=full_text,
            language=detected_lang
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({
            "success": True,
            "text": full_text,
            "file_url": file_url,
            "record_id": record.id,
            "language": detected_lang
        })

    return jsonify({"success": False, "error": res.get("error_msg", "识别失败")})

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
    records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(50).all()
    return jsonify({"success": True, "count": len(records), "records": [r.to_dict() for r in records]})

if __name__ == '__main__':
    app.run(debug=True)
