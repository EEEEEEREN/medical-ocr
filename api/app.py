import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

# 百度 SDK 兼容引入
try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

# 关键：显式指定路径，确保 Flask 能在 Vercel 这种子目录环境下找到 HTML
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

def get_db_conn():
    # 确保你在 Vercel 后台配置的环境变量名为 POSTGRES_URL
    return psycopg2.connect(os.environ.get('POSTGRES_URL'), sslmode='require')

def init_db():
    """确保数据库表存在"""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ocr_records (
                id SERIAL PRIMARY KEY, 
                image_url TEXT, 
                filename TEXT, 
                result_zh TEXT, 
                result_en TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database Init Error: {e}")

@app.route('/')
def index():
    # 尝试初始化数据库表（如果不存在的话）
    init_db()
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    try:
        # 1. 上传图片到 Vercel Blob
        new_filename = f"medical-ocr/{uuid.uuid4()}-{file.filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # 2. 百度 OCR 识别
        client = AipOcr(os.environ.get('BAIDU_APP_ID'), os.environ.get('BAIDU_OCR_AK'), os.environ.get('BAIDU_OCR_SK'))
        ocr_res = client.basicGeneral(img_data)
        ocr_text = "\n".join([item['words'] for item in ocr_res.get('words_result', [])])

        # 3. 写入数据库
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
            (blob_url, file.filename, ocr_text)
        )
        record_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True, "text": ocr_text, "image_url": blob_url, "record_id": record_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.get_json()
    try:
        cred = credential.Credential(os.environ.get('TENCENT_SECRET_ID'), os.environ.get('TENCENT_SECRET_KEY'))
        t_client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText = data.get('text')
        req.Source, req.Target = ("zh", "en") if data.get('target') == "en" else ("en", "zh")
        req.ProjectId = 0
        resp = t_client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# 必须显式暴露 app 实例给 Vercel
app = app

if __name__ == '__main__':
    app.run(debug=True)
