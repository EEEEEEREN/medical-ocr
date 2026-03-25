import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

# 解决百度 SDK 在不同环境下引入名的问题
try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

# 明确模板文件夹路径，确保在 api 子目录下能找到根目录的 templates
app = Flask(__name__, template_folder='../templates')

# --- 1. 数据库连接函数 ---
def get_db_conn():
    # 既然你的环境变量 POSTGRES_URL 没问题，直接使用
    conn = psycopg2.connect(os.environ.get('POSTGRES_URL'), sslmode='require')
    return conn

def ensure_table_exists():
    """初始化数据库表"""
    conn = get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ocr_records (
                id SERIAL PRIMARY KEY,
                image_url TEXT,
                filename TEXT,
                result_zh TEXT,
                result_en TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
    finally:
        conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    try:
        # A. 存图到 Vercel Blob
        new_filename = f"medical-ocr/{uuid.uuid4()}-{file.filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # B. 百度 OCR 识别
        client = AipOcr(
            os.environ.get('BAIDU_APP_ID'),
            os.environ.get('BAIDU_OCR_AK'),
            os.environ.get('BAIDU_OCR_SK')
        )
        ocr_res = client.basicGeneral(img_data)
        ocr_text = "\n".join([item['words'] for item in ocr_res.get('words_result', [])])

        # C. 存入数据库
        ensure_table_exists()
        conn = get_db_conn()
        record_id = None
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
                (blob_url, file.filename, ocr_text)
            )
            record_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
        finally:
            conn.close()

        return jsonify({
            "success": True, 
            "text": ocr_text, 
            "image_url": blob_url, 
            "record_id": record_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Runtime Error: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.get_json()
    text = data.get('text')
    record_id = data.get('record_id')
    target = data.get('target', 'en')

    try:
        cred = credential.Credential(
            os.environ.get('TENCENT_SECRET_ID'),
            os.environ.get('TENCENT_SECRET_KEY')
        )
        t_client = tmt_client.TmtClient(cred, "ap-guangzhou")
        
        req = models.TextTranslateRequest()
        req.SourceText = text
        req.Source = "zh" if target == "en" else "en"
        req.Target = target
        req.ProjectId = 0

        resp = t_client.TextTranslate(req)
        trans_text = resp.TargetText

        # 更新数据库中的翻译结果
        if record_id:
            conn = get_db_conn()
            try:
                cur = conn.cursor()
                field = "result_en" if target == "en" else "result_zh"
                cur.execute(f"UPDATE ocr_records SET {field} = %s WHERE id = %s", (trans_text, record_id))
                conn.commit()
                cur.close()
            finally:
                conn.close()

        return jsonify({"success": True, "text": trans_text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)
