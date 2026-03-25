import os
import uuid
from flask import Flask, render_template, request, jsonify
from vercel_blob import put
from vercel_postgres import db
from aip import AipOcr
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__)

# --- 插件初始化 (从环境变量读取) ---
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

# --- 数据库初始化 (自动建表) ---
def init_db():
    with db.cursor() as cur:
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
    db.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "请选择图片"})
    
    img_data = file.read()
    filename = file.filename

    try:
        # 1. 存图到 Vercel Blob (自动读取 BLOB_READ_WRITE_TOKEN)
        blob_path = f"medical-ocr/{uuid.uuid4()}-{filename}"
        blob_url = put(blob_path, img_data, {"access": "public"})['url']

        # 2. 百度 OCR 识别 (中文)
        ocr_res = baidu_client.basicGeneral(img_data)
        lines = [item['words'] for item in ocr_res.get('words_result', [])]
        ocr_text = "\n".join(lines)

        # 3. 存入 Vercel Postgres (初始记录)
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
                (blob_url, filename, ocr_text)
            )
            record_id = cur.fetchone()[0]
        db.commit()

        return jsonify({
            "success": True,
            "text": ocr_text,
            "image_url": blob_url,
            "record_id": record_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

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

        # 4. 同步更新数据库中的翻译结果
        if record_id:
            field = "result_en" if target == "en" else "result_zh"
            with db.cursor() as cur:
                cur.execute(f"UPDATE ocr_records SET {field} = %s WHERE id = %s", (trans_text, record_id))
            db.commit()

        return jsonify({"success": True, "text": trans_text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# 自动执行建表逻辑
with app.app_context():
    init_db()

if __name__ == '__main__':
    app.run(debug=True)
