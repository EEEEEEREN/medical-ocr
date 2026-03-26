import os
import base64
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

# Vercel Blob
import vercel_blob

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# ==================== 配置 ====================
# Neon Postgres（Vercel 集成会自动注入 DATABASE_URL）
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True}  # 防止连接断开

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
    language = db.Column(db.String(10), default='zh')          # zh / en
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_url": self.file_url,
            "ocr_text": self.ocr_text,
            "language": self.language,
            "created_at": self.created_at.isoformat()
        }

# 创建表（首次部署时会自动创建，生产环境建议用迁移工具）
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
    """上传文件到 Vercel Blob"""
    try:
        # 生成唯一文件名避免冲突
        ext = os.path.splitext(filename)[1].lower()
        unique_name = f"medical/{datetime.utcnow().strftime('%Y%m%d')}/{uuid.uuid4().hex}{ext}"
        
        blob = vercel_blob.put(
            unique_name,
            file.read(),                    # bytes
            access='public',                # 或 'private'（推荐 private + signed url）
            add_random_suffix=False
        )
        return blob.get('url') if isinstance(blob, dict) else str(blob)
    except Exception as e:
        print("Blob upload error:", e)
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

    original_filename = file.filename
    file_data = file.read()  # 读取一次，后续复用

    # 1. 上传到 Vercel Blob
    file.seek(0)  # 重置指针
    file_url = upload_to_blob(file, original_filename)

    # 2. OCR 识别（Baidu）
    img_64 = base64.b64encode(file_data).decode('utf-8')
    token = get_baidu_token()
    if not token:
        return jsonify({"success": False, "error": "Baidu OCR 鉴权失败"})

    import requests
    api_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
    res = requests.post(api_url, 
                       data={"image": img_64}, 
                       headers={'content-type': 'application/x-www-form-urlencoded'}, 
                       timeout=15).json()

    if 'words_result' in res:
        full_text = "\n".join([i['words'] for i in res['words_result']])
        
        # 3. 保存到 Neon Postgres
        detected_lang = 'en' if (sum(1 for c in full_text if c.isascii()) / len(full_text) > 0.4 if full_text else False) else 'zh'
        
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
    data = request.json
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

# 新增：获取历史记录（可选）
@app.route('/history', methods=['GET'])
def history():
    records = MedicalRecord.query.order_by(MedicalRecord.created_at.desc()).limit(50).all()
    return jsonify([r.to_dict() for r in records])

if __name__ == '__main__':
    app.run(debug=True)
