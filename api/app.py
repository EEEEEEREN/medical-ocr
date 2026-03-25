import os
import uuid
import pg8000  # 新增这一行，确保驱动被加载
from flask import Flask, render_template, request, jsonify
from vercel_blob import put
from vercel_postgres import db  # 这个引入保留，它会配合 pg8000 工作
from aip import AipOcr
from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(__name__)

# --- 1. 插件初始化 (从环境变量读取) ---
# 百度 OCR (确保 Vercel 已配置 BAIDU_APP_ID, BAIDU_OCR_AK, BAIDU_OCR_SK)
baidu_client = AipOcr(
    os.environ.get('BAIDU_APP_ID'),
    os.environ.get('BAIDU_OCR_AK'),
    os.environ.get('BAIDU_OCR_SK')
)

# 腾讯翻译 (确保 Vercel 已配置 TENCENT_SECRET_ID, TENCENT_SECRET_KEY)
tmt_cred = credential.Credential(
    os.environ.get('TENCENT_SECRET_ID'),
    os.environ.get('TENCENT_SECRET_KEY')
)
tmt_client_inst = tmt_client.TmtClient(tmt_cred, "ap-guangzhou")

# --- 2. 数据库增强逻辑 ---
def ensure_table_exists(cur):
    """强制检查并创建表，防止 Neon 后台看不到表"""
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: 
        return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    filename = file.filename

    try:
        # A. 存图到 Vercel Blob
        # 自动读取 BLOB_READ_WRITE_TOKEN
        new_filename = f"medical-ocr/{uuid.uuid4()}-{filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # B. 百度 OCR 识别
        ocr_res = baidu_client.basicGeneral(img_data)
        lines = [item['words'] for item in ocr_res.get('words_result', [])]
        ocr_text = "\n".join(lines)

        # C. 存入 Postgres 数据库 (带自动建表和提交)
        with db.cursor() as cur:
            ensure_table_exists(cur)  # 确保表存在
            cur.execute(
                "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
                (blob_url, filename, ocr_text)
            )
            record_id = cur.fetchone()[0]
        db.commit() # 必须提交，否则 Neon 后台看不到数据

        return jsonify({
            "success": True,
            "text": ocr_text,
            "image_url": blob_url,
            "record_id": record_id
        })
    except Exception as e:
        print(f"Server Error: {str(e)}") # 在 Vercel Logs 中可以查看
        return jsonify({"success": False, "error": f"服务器错误: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.get_json()
    text = data.get('text')
    record_id = data.get('record_id')
    target = data.get('target', 'en')

    if not text:
        return jsonify({"success": False, "error": "无内容待翻译"})

    try:
        req = models.TextTranslateRequest()
        req.SourceText = text
        req.Source = "zh" if target == "en" else "en"
        req.Target = target
        req.ProjectId = 0

        resp = tmt_client_inst.TextTranslate(req)
        trans_text = resp.TargetText

        # 更新数据库里的对应记录
        if record_id:
            field = "result_en" if target == "en" else "result_zh"
            with db.cursor() as cur:
                ensure_table_exists(cur)
                cur.execute(f"UPDATE ocr_records SET {field} = %s WHERE id = %s", (trans_text, record_id))
            db.commit()

        return jsonify({"success": True, "text": trans_text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == '__main__':
    # 本地运行时也会自动创建表
    app.run(debug=True)
