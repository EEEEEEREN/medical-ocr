import os
import uuid
import pg8000
from flask import Flask, render_template, request, jsonify
from vercel_blob import put
from aip import AipOcr
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__)

# --- 1. 插件初始化 ---
# 百度 OCR
baidu_client = AipOcr(
    os.environ.get('BAIDU_APP_ID'),
    os.environ.get('BAIDU_OCR_AK'),
    os.environ.get('BAIDU_OCR_SK')
)

# 腾讯翻译
tmt_cred = credential.Credential(
    os.environ.get('TENCENT_SECRET_ID'),
    os.environ.get('TENCENT_SECRET_KEY')
)
tmt_client_inst = tmt_client.TmtClient(tmt_cred, "ap-guangzhou")

# --- 2. 数据库手动连接函数 ---
def get_db_conn():
    """直接使用 POSTGRES_URL 建立连接"""
    # Vercel 的 URL 通常以 postgresql:// 开头，pg8000 完美支持
    return pg8000.connect(dsn=os.environ.get('POSTGRES_URL'))

def ensure_table_exists():
    """确保表存在"""
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
    finally:
        conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "未选择文件"})
    
    img_data = file.read()
    filename = file.filename

    try:
        # A. 存图到 Vercel Blob
        new_filename = f"medical-ocr/{uuid.uuid4()}-{filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # B. 百度 OCR 识别
        ocr_res = baidu_client.basicGeneral(img_data)
        lines = [item['words'] for item in ocr_res.get('words_result', [])]
        ocr_text = "\n".join(lines)

        # C. 存入 Postgres (手动连接模式)
        ensure_table_exists() # 每次写入前确保表在
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
                (blob_url, filename, ocr_text)
            )
            record_id = cur.fetchone()[0]
            conn.commit()
        finally:
            conn.close()

        return jsonify({
            "success": True,
            "text": ocr_text,
            "image_url": blob_url,
            "record_id": record_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"服务器错误: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.get_json()
    text = data.get('text')
    record_id = data.get('record_id')
    target = data.get('target', 'en')

    try:
        req = models.TextTranslateRequest()
        req.SourceText = text
        req.Source = "zh" if target == "en" else "en"
        req.Target = target
        req.ProjectId = 0

        resp = tmt_client_inst.TextTranslate(req)
        trans_text = resp.TargetText

        # 更新数据库
        if record_id:
            conn = get_db_conn()
            try:
                cur = conn.cursor()
                field = "result_en" if target == "en" else "result_zh"
                cur.execute(f"UPDATE ocr_records SET {field} = %s WHERE id = %s", (trans_text, record_id))
                conn.commit()
            finally:
                conn.close()

        return jsonify({"success": True, "text": trans_text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)
